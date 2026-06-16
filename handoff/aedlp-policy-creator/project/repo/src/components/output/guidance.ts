// Copy/paste guidance text for AEDLP Architect output.
// In production, POST /policy/render-instructions could produce this server-side.
import type { OutputCtx } from "../../types";

export const SCAN_LOCATIONS = "Email body\nEmail subject\nAttachment text (if attachment scanning is required)";
export const OUTLOOK_NOTES = "Requires Outlook Add-in 2.4.4 or higher.\nPolicy changes sync every 30 minutes; restart Outlook to force a sync.\nAfter saving, wait at least 60 seconds before testing.";
export const GATEWAY_NOTES = "Requires Tessian Gateway.\nChanges may take ~10 minutes to apply.\n\"Warn & require justification\" is unsupported in Gateway bounceback warnings.\nHyperlinks in warnings render as non-clickable plain-text URLs.";
export const ATTACH_NOTES = "Supported: DOC, XLS, PPT, DOCX, XLSX, PPTX, PDF, RTF, TXT, CSV, ZIP, G-ZIP, 7-ZIP, G-ZIP-TAR.\nEncrypted or password-protected attachments are NOT scanned.\nLarger extracted text and heavier regex increase scan time.";
export const TESTING_NOTES = "Scope to yourself or a small test group first.\nTest one change at a time.\nSave the policy and ensure it is enabled.\nRestart Outlook to force Add-in sync if needed.\nWait ~10 minutes if testing via Gateway.\nTest in the AEDLP Custom Policy Tester before production rollout.";

export function buildArchitectGuide(ctx: OutputCtx): string {
  const lines: string[] = [];
  lines.push("Policy name:\n" + ctx.policyName);
  lines.push("\nCondition:\nRegex match");
  lines.push("\nRegex (as edited):\n" + ctx.baseRegex);
  if (ctx.effectiveRegex !== ctx.baseRegex)
    lines.push("\nRegex (with " + ctx.boundaryLabel + "):\n" + ctx.effectiveRegex);
  lines.push("\nSuggested context keywords:\n" + (ctx.keywords.length ? ctx.keywords.join("\n") : "(none)"));
  lines.push("\nRecommended action:\n" + ctx.actionLabel);
  lines.push("\nRecommended scan locations:\n" + SCAN_LOCATIONS);
  lines.push("\nOutlook Add-in notes:\n" + OUTLOOK_NOTES);
  lines.push("\nGateway notes:\n" + GATEWAY_NOTES);
  lines.push("\nAttachment scanning notes:\n" + ATTACH_NOTES);
  lines.push("\nTesting notes:\n" + TESTING_NOTES);
  return lines.join("\n");
}
