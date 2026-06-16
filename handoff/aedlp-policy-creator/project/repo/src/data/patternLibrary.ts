// ============================================================
// AEDLP Policy Creator — static pattern library + reference data.
// Mock data only. Safe / example values. No real personal data.
// In production this module is replaced by GET /patterns/* calls.
// ============================================================
import type {
  Detector, DetectionTypeOption, RecommendedAction, ActionInfo,
  BoundaryStrategy, CompatNote
} from "../types";

  export const detectors: Detector[] = [
    {
      id: "gb-driving-licence-number",
      displayName: "UK Driving Licence Number",
      aliases: ["uk driving licence", "uk driver's license", "gb driving licence", "dvla licence number", "driver number"],
      description: "Detector for UK driving licence-style identifiers based on AEDLP regex documentation.",
      country: "GB", regionLabel: "United Kingdom", category: "Government ID",
      conditionType: "regular_expression",
      regex: "\\b[A-Z0-9]{5}\\d[0156]\\d([0][1-9]|[12]\\d|3[01])\\d[A-Z0-9]{3}[A-Z]{2}\\b",
      contextKeywords: ["driving licence", "driver's license", "driver number", "DVLA", "licence number"],
      positiveExamples: ["Driver number: JOHNS711215GG9SY", "DVLA licence number JOHNS711215GG9SY"],
      negativeExamples: ["Reference number ABCDE12345", "The project code is ALPHA123"],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "Use context keywords to reduce false positives.", "Confirm behavior in the AEDLP Custom Policy Tester before production use."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "gb-national-insurance-number",
      displayName: "UK National Insurance Number",
      aliases: ["uk national insurance number", "nino", "national insurance", "ni number"],
      description: "Detector for UK National Insurance Number-style identifiers.",
      country: "GB", regionLabel: "United Kingdom", category: "Government ID",
      conditionType: "regular_expression",
      regex: "\\b(?!BG|GB|KN|NK|NT|TN|ZZ|.O)[A-CEGHJ-PR-TW-Z]{2}\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?[ABCD]\\b",
      contextKeywords: ["national insurance", "NINO", "NI number", "HMRC"],
      positiveExamples: ["National Insurance number: JG103759A"],
      negativeExamples: ["Reference: AB123456Z", "Code: ZZ123456A"],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "Uses a negative lookahead — confirm lookahead support in the AEDLP engine.", "Use context keywords to reduce false positives."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "gb-passport-number",
      displayName: "UK Passport Number",
      aliases: ["uk passport", "uk passport number", "gb passport", "british passport"],
      description: "Detector for UK passport number-style identifiers.",
      country: "GB", regionLabel: "United Kingdom", category: "Government ID",
      conditionType: "regular_expression",
      regex: "\\b[0-9]{10}GBR[0-9]{7}[U,M,F]{1}[0-9]{9}\\b",
      contextKeywords: ["passport", "passport number", "British passport", "GBR"],
      positiveExamples: ["Passport: 7086493126GBR6510204M150224602"],
      negativeExamples: ["Reference: 7086493126ABC6510204M150224602"],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "gb-electoral-roll-number",
      displayName: "UK Electoral Roll Number",
      aliases: ["uk electoral roll", "electoral roll number", "voter number"],
      description: "Detector for UK electoral roll number-style identifiers.",
      country: "GB", regionLabel: "United Kingdom", category: "Government ID",
      conditionType: "regular_expression",
      regex: "\\b[a-zA-Z]{2}[0-9]{4}\\b",
      contextKeywords: ["electoral roll", "voter", "voter number"],
      positiveExamples: ["Electoral roll number: NR2345"],
      negativeExamples: ["URL fragment: ASADNR2345ASD123"],
      recommendedAction: "warn", falsePositiveRisk: "high", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "Very broad — use AEDLP-style boundary wrapping and context keywords to reduce substring matches."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "gb-iban",
      displayName: "UK IBAN",
      aliases: ["uk iban", "gb iban", "international bank account number"],
      description: "Detector for UK International Bank Account Number-style identifiers.",
      country: "GB", regionLabel: "United Kingdom", category: "Financial data",
      conditionType: "regular_expression",
      regex: "\\bGB[0-9]{2}[ ]?[A-Za-z]{4}[ ]?[0-9]{4}[ ]?[0-9]{4}[ ]?[0-9]{4}[ ]?[0-9]{2}\\b",
      contextKeywords: ["IBAN", "international bank account number", "bank account"],
      positiveExamples: ["IBAN: GB29 NWBK 6016 1331 9268 19"],
      negativeExamples: ["Reference: GB29 TEST ABCD"],
      recommendedAction: "warn", falsePositiveRisk: "low", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "us-social-security-number",
      displayName: "US Social Security Number",
      aliases: ["us ssn", "social security number", "ssn"],
      description: "Detector for US Social Security Number-style identifiers.",
      country: "US", regionLabel: "United States", category: "Government ID",
      conditionType: "regular_expression",
      regex: "\\d{3}-\\d{2}-\\d{4}",
      contextKeywords: ["SSN", "social security", "social security number"],
      positiveExamples: ["SSN: 575-39-7494"],
      negativeExamples: ["Phone: 575-397-4940", "Ref: 575397494"],
      recommendedAction: "warn", falsePositiveRisk: "high", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "This simple pattern may create false positives without context keywords or boundary wrapping."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "us-passport-number",
      displayName: "US Passport Number",
      aliases: ["us passport", "us passport number", "passport number"],
      description: "Detector for US passport number-style identifiers with passport context terms.",
      country: "US", regionLabel: "United States", category: "Government ID",
      conditionType: "regular_expression",
      regex: "(Passport Number|Passport No|Passport #|Passport#|PassportID|Passportno|passportnumber)\\W*\\d{9}\\b",
      contextKeywords: ["passport", "passport number", "passport no", "passport ID"],
      positiveExamples: ["Passport Number: 123456789"],
      negativeExamples: ["Account Number: 123456789"],
      recommendedAction: "warn", falsePositiveRisk: "low", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "The regex embeds passport context terms, so boundary wrapping is usually unnecessary."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "us-bank-account-number",
      displayName: "US Bank Account Number",
      aliases: ["us bank account", "bank account number", "account number"],
      description: "Detector for US bank account number-style identifiers with bank account context terms.",
      country: "US", regionLabel: "United States", category: "Financial data",
      conditionType: "regular_expression",
      regex: "Bank Account Number\\W*\\d{8,17}\\b",
      contextKeywords: ["bank account number", "account number", "bank account"],
      positiveExamples: ["Bank Account Number: 12345678"],
      negativeExamples: ["Ticket Number: 12345678"],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "The regex embeds bank account context terms."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "us-itin",
      displayName: "US ITIN",
      aliases: ["us itin", "individual taxpayer identification number", "taxpayer id"],
      description: "Detector for US Individual Taxpayer Identification Number-style identifiers.",
      country: "US", regionLabel: "United States", category: "Government ID",
      conditionType: "regular_expression",
      regex: "(9\\d{2})([ \\-]?)([7]\\d|8[0-8])([ \\-]?)(\\d{4})",
      contextKeywords: ["ITIN", "individual taxpayer identification number", "taxpayer identification"],
      positiveExamples: ["ITIN: 999-88-9999"],
      negativeExamples: ["SSN: 123-45-6789"],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "credit-card-number",
      displayName: "Credit Card Number",
      aliases: ["credit card", "card number", "visa", "mastercard", "amex", "american express", "discover"],
      description: "Detector for common credit card number-style identifiers.",
      country: "GLOBAL", regionLabel: "Global", category: "Financial data",
      conditionType: "regular_expression",
      regex: "\\b(((4\\d{3})|(5[1-5]\\d{2})|(6011))-?\\d{4}-?\\d{4}-?\\d{4}|3[4,7]\\d{13})\\b",
      contextKeywords: ["credit card", "card number", "payment card", "Visa", "Mastercard", "American Express"],
      positiveExamples: ["Card number: 5423-1111-1111-1111"],
      negativeExamples: ["Reference: 5423-111-111-111"],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "Prototype does not perform Luhn checksum validation."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "nhs-number",
      displayName: "NHS Number",
      aliases: ["nhs number", "uk nhs", "health number"],
      description: "Detector for NHS number-style identifiers.",
      country: "GB", regionLabel: "United Kingdom", category: "Health data",
      conditionType: "regular_expression",
      regex: "^(?:\\d{3}[-\\s]?\\d{3}[-\\s]?\\d{4})$",
      contextKeywords: ["NHS", "NHS number", "patient number"],
      positiveExamples: ["123-123-1234"],
      negativeExamples: ["123-12-12345"],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation.", "This pattern is anchored (^…$) and may only match when the sample text contains just the NHS number. Consider an unanchored variant for email body scanning."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "zoom-link",
      displayName: "Zoom Link",
      aliases: ["zoom", "zoom link", "zoom meeting", "meeting link"],
      description: "Detector for Zoom meeting links.",
      country: "GLOBAL", regionLabel: "Global", category: "Confidential business data",
      conditionType: "regular_expression",
      regex: "\\.zoom\\.us\\/j\\/\\d{9}",
      contextKeywords: ["zoom", "meeting", "meeting link"],
      positiveExamples: ["https://tessian.zoom.us/j/961234965"],
      negativeExamples: ["https://example.com/j/961234965"],
      recommendedAction: "silently_track", falsePositiveRisk: "low", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Pattern based on AEDLP regex documentation."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    },
    {
      id: "confidential-project-keywords",
      displayName: "Confidential Project Keywords",
      aliases: ["confidential project", "project keywords", "sensitive project names", "m&a keywords", "merger keywords"],
      description: "Prototype keyword-style detector for confidential business terms. Regex support is not required for this detector in phase one.",
      country: "GLOBAL", regionLabel: "Global", category: "Confidential business data",
      conditionType: "keyword",
      contextKeywords: ["confidential", "strictly confidential", "project alpha", "merger", "acquisition", "board deck"],
      positiveExamples: ["This is a strictly confidential board deck for Project Alpha."],
      negativeExamples: ["This is a public project update."],
      recommendedAction: "warn", falsePositiveRisk: "medium", supportsAttachmentScanning: true,
      confidence: "medium", version: "0.1.0", status: "draft",
      notes: ["Keyword condition type displays as coming soon in the first prototype.", "Included to show how the model can expand beyond regex."],
      compatibility: { regexEngine: "unknown", lookbehind: "unknown", unicodeClasses: "unknown", caseInsensitiveFlag: "unknown" }
    }
  ];

  export const dataTypes: string[] = ["Government ID", "Financial data", "Personal data", "Health data", "Confidential business data", "Custom"];
  export const regions: string[] = ["Global", "United Kingdom", "United States", "France", "Germany", "Spain", "Custom"];
  export const detectionTypes: DetectionTypeOption[] = [
    { id: "regular_expression", label: "Regular expression", ready: true },
    { id: "keyword", label: "Keyword", ready: false },
    { id: "keyword_pattern", label: "Keyword pattern", ready: false },
    { id: "mip_label", label: "MIP label", ready: false },
    { id: "attachment_metadata", label: "Attachment metadata", ready: false },
    { id: "classification_label", label: "Classification label", ready: false }
  ];

  export const actions: Record<RecommendedAction, ActionInfo> = {
    silently_track: { label: "Silently track", desc: "Log the event only; no end-user warning.", gateway: true },
    warn: { label: "Warn", desc: "Show the sender a warning they can dismiss.", gateway: true },
    warn_require_justification: { label: "Warn & require justification", desc: "Sender must enter a justification to proceed.", gateway: false },
    block: { label: "Block", desc: "Prevent the email from being sent.", gateway: true }
  };

  export const boundaryStrategies: BoundaryStrategy[] = [
    { id: "as_is", label: "Use detector regex as-is", prefix: "", suffix: "", desc: "No changes. Use when the detector already includes its own anchoring or context terms." },
    { id: "word", label: "Simple word boundaries", prefix: "\\b", suffix: "\\b", desc: "Wrap with \\b … \\b. Good general default for alphanumeric identifiers." },
    { id: "aedlp", label: "AEDLP-style whitespace / colon boundaries", prefix: "(^|\\s|:)", suffix: "($|\\s)", desc: "Wrap with (^|\\s|:) … ($|\\s). Reduces substring matches inside URLs and long IDs, but the matched value may include the surrounding whitespace/colon." },
    { id: "none", label: "No boundary wrapper", prefix: "", suffix: "", desc: "Strip any wrapper and match raw. Highest false-positive risk." }
  ];

  export const testingChecklist: string[] = [
    "Test in this prototype tester",
    "Test in Regexr or Regex101",
    "Test in the AEDLP Custom Policy Tester",
    "Scope the policy to yourself or a small test group",
    "Test one change at a time",
    "Save the policy",
    "Restart Outlook to force Add-in sync if needed",
    "Wait ~10 minutes for Gateway sync if testing via Gateway",
    "Check AND / OR logical operators",
    "Avoid overlapping match behavior with other active policies",
    "Monitor the Security Event Viewer after rollout"
  ];

  export const compatibilityNotes: CompatNote[] = [
    { icon: "plug", text: "<b>Outlook Add-in</b> requires version 2.4.4 or higher." },
    { icon: "server", text: "<b>Gateway</b> requires Tessian Gateway." },
    { icon: "clock", text: "Outlook Add-in syncs every 30 minutes; restart Outlook to force a sync." },
    { icon: "clock", text: "Gateway changes may take around 10 minutes to apply." },
    { icon: "ban", text: "Gateway does not support <b>“Warn & require justification”</b> in bounceback warnings." },
    { icon: "link", text: "Gateway renders warning hyperlinks as non-clickable plain-text URLs." },
    { icon: "lock", text: "Encrypted or password-protected attachments are <b>not scanned</b>." },
    { icon: "alert", text: "Browser regex testing is not guaranteed to match AEDLP production regex behavior." },
    { icon: "alert", text: "Confirm AEDLP regex flavor, lookaround support, Unicode handling, and pattern limits before production." },
    { icon: "alert", text: "API parameter updates do <b>not</b> equal full policy creation." }
  ];

  export const attachmentTypes = {
    office: ["DOC", "XLS", "PPT", "DOCX", "XLSX", "PPTX"],
    documents: ["PDF", "RTF", "TXT", "CSV"],
    archives: ["ZIP", "G-ZIP", "7-ZIP", "G-ZIP-TAR"]
  };
