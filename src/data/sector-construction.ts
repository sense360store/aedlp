/* ============================================================
   AEDLP — Sector batch: Construction & real estate
   New industry: "Construction & real estate". Example detectors only, no real PII.
   Format-only for the in-browser tester; AEDLP does real validation.

   Shapes mirror the existing library detectors; only the TypeScript type
   annotations were added when wiring this vetted batch into the library.
   Patterns, keywords, groups, proximity values, domains and notes are
   preserved verbatim.
   ============================================================ */
import type {
  Detector,
  RegexDetector,
  KeywordDetector,
  KeywordPatternDetector,
  RecipientDomainDetector,
} from "../types";

export const conRegex: RegexDetector[] = [
  { id: "gb-land-registry-title", displayName: "UK Land Registry Title Number", conditionType: "regular_expression",
    industry: "Construction & real estate",
    aliases: ["title number", "land registry", "title deed"],
    description: "HM Land Registry title number (area letters + digits), format only.",
    country: "GB", regionLabel: "United Kingdom", category: "Confidential business data",
    regex: "\\b[A-Z]{1,3}\\d{5,6}\\b",
    contextKeywords: ["title number", "land registry", "HM Land Registry", "title deed", "register"],
    positiveExamples: ["Title number: NGL123456", "AB123456 registered"],
    negativeExamples: ["Ref 12345", "Model ABC"],
    recommendedAction: "warn", falsePositiveRisk: "medium",
    notes: ["Area-prefix plus digits; pair with land-registry context to reduce noise."] },

  { id: "uk-planning-ref", displayName: "UK Planning Application Reference", conditionType: "regular_expression",
    industry: "Construction & real estate",
    aliases: ["planning reference", "planning application", "LPA reference"],
    description: "Local planning authority application reference (YY/NNNNN/TYPE), format only.",
    country: "GB", regionLabel: "United Kingdom", category: "Confidential business data",
    regex: "\\b\\d{2}\\/\\d{4,5}\\/[A-Z]{2,4}\\b",
    contextKeywords: ["planning", "application", "LPA", "planning permission", "consent"],
    positiveExamples: ["Planning ref 23/01234/FUL", "24/00567/OUT approved"],
    negativeExamples: ["Date 23/2024", "Ratio 16/9"],
    recommendedAction: "warn", falsePositiveRisk: "medium",
    notes: ["Council reference formats vary; this matches the common YY/NNNNN/TYPE shape."] },
];
export const conKeywords: KeywordDetector[] = [
  { id: "kw-construction-terms", displayName: "Construction & Property Terms", conditionType: "keyword",
    industry: "Construction & real estate", contextKeywords: [],
    matchMode: { caseInsensitive: true, wholeWord: true },
    aliases: ["construction terms", "property terms", "building terms"],
    description: "Construction, warranty and property-transaction marker terms.",
    country: "GB", regionLabel: "United Kingdom", category: "Confidential business data",
    keywords: ["RIBA stage", "practical completion", "retention", "CDM", "NHBC", "Buildmark", "CSCS", "section 106", "S106", "building control", "snagging", "leasehold", "freehold", "title deed"],
    positiveExamples: ["NHBC Buildmark cover applies at practical completion; retention released after snagging."],
    negativeExamples: ["The marketing brochure is attached."],
    recommendedAction: "warn", falsePositiveRisk: "low",
    notes: ["Whole-word matching; sector vocabulary for construction and property transactions."] },
];
export const conKeywordPatterns: KeywordPatternDetector[] = [
  { id: "kp-construction-tender", displayName: "Construction Tender / Bid Sensitive", conditionType: "keyword_pattern",
    industry: "Construction & real estate",
    matchMode: { caseInsensitive: true, wholeWord: true },
    aliases: ["tender sensitive", "bid pricing", "subcontract pricing"],
    description: "Tender or pricing terms near a confidentiality marker.",
    country: "GB", regionLabel: "United Kingdom", category: "Confidential business data",
    groups: [["tender", "bid", "quotation", "pricing", "bill of quantities", "BoQ", "subcontract", "pre-construction"], ["confidential", "commercially sensitive", "do not distribute", "not for circulation", "private"]],
    operator: "AND", proximity: 15,
    positiveExamples: ["The tender pricing is commercially sensitive, do not distribute."],
    negativeExamples: ["The bid for the community award is public.", "Confidential HR matter."],
    recommendedAction: "warn_require_justification", falsePositiveRisk: "medium",
    notes: ["Bid or tender pricing near a confidentiality marker, a common construction leakage pattern."] },
];
export const conPacks: RecipientDomainDetector[] = [
  { id: "rcp-competitors-construction", displayName: "Competitor Domains — Construction & Real Estate",
    conditionType: "recipient_domain", matchMode: { caseInsensitive: true, wholeWord: true }, contextKeywords: [],
    industry: "Construction & real estate", industries: ["Construction & real estate"],
    aliases: ["housebuilder competitors", "developer competitors", "construction rivals"],
    description: "Recipient on a major UK housebuilder or developer domain. Industry starting list, curate before use.",
    country: "GB", regionLabel: "United Kingdom", category: "Recipients & destinations",
    domains: ["barrattdevelopments.co.uk","barrattredrow.co.uk","redrow.co.uk","taylorwimpey.co.uk","persimmonhomes.com","bellway.co.uk","berkeleygroup.co.uk","vistrygroup.co.uk","countrysidepartnerships.com","bloorhomes.com","cala.co.uk","crestnicholson.com","millerhomes.co.uk","keepmoat.com","hill.co.uk","mccarthyandstone.co.uk","galliardhomes.com"],
    positiveExamples: ["Sending the land appraisal to buyer@taylorwimpey.co.uk"],
    negativeExamples: ["Send to client@our-subcontractor.co.uk"],
    recommendedAction: "block", falsePositiveRisk: "low",
    notes: ["Industry starting list of major UK housebuilders. Remove your own organisation and add the specific rivals that matter before deploying.","Several firms use multiple brand domains (e.g. Barratt Redrow uses barrattdevelopments.co.uk and redrow.co.uk); confirm coverage."] },
];
export const constructionDetectors: Detector[] = [...conRegex, ...conKeywords, ...conKeywordPatterns, ...conPacks];
