/* ============================================================
   AEDLP Policy Creator — UK PII detector batch
   Five United Kingdom personal-data detectors:
     • 3 regular_expression: gb-postcode, gb-mobile, gb-dob
     • 2 keyword_pattern:    kp-gb-identity-bundle, kp-gb-special-category

   These are deliberately broad signals. gb-postcode, gb-mobile and gb-dob
   each match common UK-shaped tokens and carry a medium/high false-positive
   risk on their own; they are only fully identifying in combination with a
   name or another identifier. Do not "tighten" them in isolation.

   Browser RegExp is NOT the AEDLP production engine; all matches must be
   confirmed in the AEDLP Custom Policy Tester. Safe / example values only —
   no real personal data.

   Shapes mirror the existing library detectors: regex detectors carry
   `contextKeywords`; keyword_pattern detectors carry `groups`, `operator`,
   `proximity` and `matchMode { caseInsensitive: true, wholeWord: true }`.
   All use country "GB", region "United Kingdom" and category
   "Personal data (PII)".
   ============================================================ */
import type { RegexDetector, KeywordPatternDetector } from "../types";

/* ---------------- regular-expression detectors ---------------- */

export const gbPostcode: RegexDetector = {
  id: "gb-postcode",
  displayName: "UK Postcode",
  conditionType: "regular_expression",
  aliases: ["uk postcode", "gb postcode", "post code", "postal code"],
  description: "UK postcode-style token (outward + inward code).",
  country: "GB",
  regionLabel: "United Kingdom",
  category: "Personal data (PII)",
  regex: "\\b[A-Z]{1,2}[0-9][A-Z0-9]?\\s?[0-9][A-Z]{2}\\b",
  contextKeywords: ["postcode", "post code", "address", "post town", "delivery"],
  positiveExamples: [
    "Delivery to SW1A 1AA",
    "Office postcode EC1A 1BB",
    "Site address M1 1AE",
    "Home postcode B33 8TH",
  ],
  negativeExamples: ["Order reference AB123 shipped", "Model number X1 200"],
  recommendedAction: "warn",
  falsePositiveRisk: "high",
  notes: [
    "Intentionally broad: many short alphanumeric tokens resemble a UK postcode. Only fully identifying in combination with a name or other identifier — do not tighten in isolation.",
    "Browser RegExp only; confirm in the AEDLP Custom Policy Tester.",
  ],
};

export const gbMobile: RegexDetector = {
  id: "gb-mobile",
  displayName: "UK Mobile Number",
  conditionType: "regular_expression",
  aliases: ["uk mobile", "gb mobile", "uk mobile number", "uk phone number"],
  description: "UK mobile-number-style token (07… or +447… with spacing variants).",
  country: "GB",
  regionLabel: "United Kingdom",
  category: "Personal data (PII)",
  regex: "(?:\\+44\\s?7\\d{3}|\\b07\\d{3})\\s?\\d{3}\\s?\\d{3}\\b",
  contextKeywords: ["mobile", "phone", "telephone", "mobile number", "call", "text"],
  positiveExamples: [
    "Call me on 07911 123456",
    "Mobile: +44 7911 123456",
    "Reach me at 07700 900123",
  ],
  negativeExamples: ["Invoice total 1234 567", "Landline 0207 946 0000"],
  recommendedAction: "warn",
  falsePositiveRisk: "medium",
  notes: [
    "Intentionally broad: matches UK mobile-number shapes (07/+447) including spacing variants; some reference numbers can resemble it. Only fully identifying in combination — do not tighten in isolation.",
    "Browser RegExp only; confirm in the AEDLP Custom Policy Tester.",
  ],
};

export const gbDob: RegexDetector = {
  id: "gb-dob",
  displayName: "UK Date of Birth",
  conditionType: "regular_expression",
  aliases: ["date of birth", "dob", "uk date of birth", "birth date"],
  description: "Date-of-birth-style token in day/month/year order (UK convention).",
  country: "GB",
  regionLabel: "United Kingdom",
  category: "Personal data (PII)",
  regex: "\\b(0?[1-9]|[12]\\d|3[01])[\\/.\\-](0?[1-9]|1[0-2])[\\/.\\-](19|20)\\d{2}\\b",
  contextKeywords: ["date of birth", "DOB", "born", "birthday", "d.o.b"],
  positiveExamples: [
    "Date of birth 04/11/1981",
    "DOB: 23-07-1990",
    "Born 1.1.2000",
  ],
  negativeExamples: ["Invoice 12/2024 issued", "Version 3.14.1592"],
  recommendedAction: "warn",
  falsePositiveRisk: "high",
  notes: [
    "Intentionally broad: matches common day/month/year date shapes, many of which are not dates of birth. Only identifying in combination with a name or other identifier — do not tighten in isolation.",
    "Browser RegExp only; confirm in the AEDLP Custom Policy Tester.",
  ],
};

/* ---------------- keyword-pattern detectors ---------------- */

export const gbIdentityBundle: KeywordPatternDetector = {
  id: "kp-gb-identity-bundle",
  displayName: "UK Identity Data Bundle",
  conditionType: "keyword_pattern",
  aliases: ["uk identity bundle", "uk pii combination", "identity data set"],
  description:
    "A personal identifier co-occurring with a UK identification number within the proximity window — the combination is what identifies an individual.",
  country: "GB",
  regionLabel: "United Kingdom",
  category: "Personal data (PII)",
  groups: [
    ["full name", "name", "date of birth", "DOB", "home address", "address"],
    ["national insurance", "NHS number", "passport number", "driving licence", "postcode"],
  ],
  operator: "AND",
  proximity: 20,
  matchMode: { caseInsensitive: true, wholeWord: true },
  positiveExamples: [
    "Customer full name and date of birth on file, with National Insurance number and home postcode.",
  ],
  negativeExamples: ["Please confirm your full name and date of birth for our records."],
  recommendedAction: "warn",
  falsePositiveRisk: "medium",
  notes: [
    "Trips only when a personal identifier co-occurs with a UK identification number within the proximity window — the combination is what identifies an individual.",
    "Browser RegExp only; confirm in the AEDLP Custom Policy Tester.",
  ],
};

export const gbSpecialCategory: KeywordPatternDetector = {
  id: "kp-gb-special-category",
  displayName: "UK Special Category Data",
  conditionType: "keyword_pattern",
  aliases: ["uk special category", "gdpr article 9", "sensitive personal data uk"],
  description:
    "GDPR Article 9 special-category indicators (health, ethnicity, religion, etc.) co-occurring with a person reference.",
  country: "GB",
  regionLabel: "United Kingdom",
  category: "Personal data (PII)",
  groups: [
    [
      "health",
      "medical",
      "diagnosis",
      "disability",
      "mental health",
      "ethnicity",
      "religion",
      "religious belief",
      "sexual orientation",
      "trade union",
      "political opinion",
      "biometric",
      "genetic",
    ],
    ["patient", "employee", "named individual", "individual", "staff member", "name"],
  ],
  operator: "AND",
  proximity: 15,
  matchMode: { caseInsensitive: true, wholeWord: true },
  positiveExamples: [
    "The named individual's medical diagnosis and disability are recorded in the employee file.",
  ],
  negativeExamples: ["Our public health newsletter covers general medical advice."],
  recommendedAction: "warn",
  falsePositiveRisk: "medium",
  notes: [
    "Flags GDPR Article 9 special-category indicators co-occurring with a person reference; special-category data carries elevated obligations — consider stricter actions.",
    "Browser RegExp only; confirm in the AEDLP Custom Policy Tester.",
  ],
};

/* ---------------- exports ---------------- */

/** The three regular-expression UK PII detectors. */
export const ukPiiRegexDetectors: RegexDetector[] = [gbPostcode, gbMobile, gbDob];

/** The two keyword-pattern UK PII detectors. */
export const ukPiiKeywordPatternDetectors: KeywordPatternDetector[] = [
  gbIdentityBundle,
  gbSpecialCategory,
];

/** All five UK PII detectors, in library display order. */
export const ukPiiDetectors = [...ukPiiRegexDetectors, ...ukPiiKeywordPatternDetectors];
