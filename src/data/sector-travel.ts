/* ============================================================
   AEDLP — Sector batch: Travel & transport
   New industry: "Travel & transport". Example detectors only, no real PII.

   Shapes mirror the existing library detectors; only the TypeScript type
   annotations were added when wiring this vetted batch into the library.
   Patterns, keywords, groups, proximity values, domains and notes are
   preserved verbatim (including the IAG/group caution on the airline pack).
   ============================================================ */
import type {
  Detector,
  RegexDetector,
  KeywordDetector,
  KeywordPatternDetector,
  RecipientDomainDetector,
} from "../types";

export const travRegex: RegexDetector[] = [
  { id: "airline-pnr", displayName: "Booking Reference / PNR", conditionType: "regular_expression",
    industry: "Travel & transport",
    aliases: ["PNR", "booking reference", "record locator", "passenger name record"],
    description: "6-character airline booking reference / PNR, format only.",
    country: "GLOBAL", regionLabel: "Global", category: "Personal data (PII)",
    regex: "\\b[A-Z0-9]{6}\\b",
    contextKeywords: ["PNR", "booking reference", "record locator", "booking ref", "reservation"],
    positiveExamples: ["Booking reference: 3X9QZK", "PNR ABC123"],
    negativeExamples: ["Code 12", "Reference ABCDEFG"],
    recommendedAction: "warn", falsePositiveRisk: "high",
    notes: ["A bare 6-char alphanumeric is very broad; only meaningful near booking/PNR context."] },

  { id: "airline-ticket-number", displayName: "Airline E-Ticket Number", conditionType: "regular_expression",
    industry: "Travel & transport",
    aliases: ["ticket number", "e-ticket", "etkt"],
    description: "13-digit airline ticket number (3-digit carrier prefix + 10), format only.",
    country: "GLOBAL", regionLabel: "Global", category: "Personal data (PII)",
    regex: "\\b\\d{3}[- ]?\\d{10}\\b",
    contextKeywords: ["ticket", "e-ticket", "etkt", "ticket number"],
    positiveExamples: ["e-ticket 125 1234567890", "1251234567890"],
    negativeExamples: ["Phone 0161 4960123"],
    recommendedAction: "warn", falsePositiveRisk: "medium",
    notes: ["Carrier 3-digit prefix plus 10 digits; pair with ticket context."] },
];
export const travKeywords: KeywordDetector[] = [
  { id: "kw-travel-terms", displayName: "Travel & Passenger Data Terms", conditionType: "keyword",
    industry: "Travel & transport", contextKeywords: [],
    matchMode: { caseInsensitive: true, wholeWord: true },
    aliases: ["travel terms", "passenger data", "aviation terms"],
    description: "Passenger, booking and aviation operational marker terms.",
    country: "GLOBAL", regionLabel: "Global", category: "Personal data (PII)",
    keywords: ["PNR", "passenger name record", "booking reference", "e-ticket", "frequent flyer", "loyalty number", "boarding pass", "passenger manifest", "crew roster", "APIS", "advance passenger information"],
    positiveExamples: ["The passenger manifest and frequent flyer numbers are attached."],
    negativeExamples: ["The staff travel policy is published."],
    recommendedAction: "warn", falsePositiveRisk: "low",
    notes: ["Sector vocabulary for passenger and aviation operations data."] },
];
export const travKeywordPatterns: KeywordPatternDetector[] = [
  { id: "kp-passenger-identity", displayName: "Passenger Identity Data", conditionType: "keyword_pattern",
    industry: "Travel & transport",
    matchMode: { caseInsensitive: true, wholeWord: true },
    aliases: ["passenger PII", "traveller identity", "manifest PII"],
    description: "A passenger/traveller reference near an identity element.",
    country: "GLOBAL", regionLabel: "Global", category: "Personal data (PII)",
    groups: [["passenger", "traveller", "crew", "booking", "manifest"], ["passport", "date of birth", "DOB", "frequent flyer", "PNR", "itinerary", "nationality"]],
    operator: "AND", proximity: 15,
    positiveExamples: ["Passenger manifest includes passport and date of birth for each traveller."],
    negativeExamples: ["The booking system is down for maintenance.", "Passport office opening hours."],
    recommendedAction: "warn_require_justification", falsePositiveRisk: "medium",
    notes: ["Passenger reference plus an identity element is the practical PII trigger for travel data."] },
];
export const travPacks: RecipientDomainDetector[] = [
  { id: "rcp-competitors-airlines", displayName: "Competitor Domains — Airlines (UK & Europe)",
    conditionType: "recipient_domain", matchMode: { caseInsensitive: true, wholeWord: true }, contextKeywords: [],
    industry: "Travel & transport", industries: ["Travel & transport"],
    aliases: ["airline competitors", "carrier domains", "aviation rivals"],
    description: "Recipient on a major airline domain. Industry starting list, curate before use.",
    country: "GLOBAL", regionLabel: "Global", category: "Recipients & destinations",
    domains: ["britishairways.com","virginatlantic.com","easyjet.com","ryanair.com","jet2.com","tui.co.uk","wizzair.com","lufthansa.com","airfrance.com","klm.com","emirates.com","qatarairways.com","united.com","delta.com","aa.com","iberia.com","aerlingus.com","vueling.com"],
    positiveExamples: ["Sending the route plan to contact@easyjet.com"],
    negativeExamples: ["Send to partner@our-ground-handler.com"],
    recommendedAction: "block", falsePositiveRisk: "low",
    notes: ["Industry starting list. CAUTION: corporate groups matter, e.g. British Airways, Iberia, Aer Lingus and Vueling are all IAG; for a BA customer the IAG siblings are intra-group, not competitors, and belong on the trusted list, not here. Remove your own organisation and group, and any joint-venture or alliance partners (e.g. a transatlantic JV partner), before deploying."] },
];
export const travelDetectors: Detector[] = [...travRegex, ...travKeywords, ...travKeywordPatterns, ...travPacks];
