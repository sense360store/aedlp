# AEDLP Policy Creator

A first-stage **frontend prototype** that helps users build **Adaptive Email DLP (AEDLP) Custom Policy** rules. Phase one focuses on **regular-expression** detectors and produces **copy/paste-ready output** for the AEDLP Architect Custom Policy editor.

> **Prototype only.** All data is mock/static. Regex testing uses the browser's JavaScript `RegExp` engine, which is **not guaranteed** to match AEDLP production regex behavior. Confirm the AEDLP regex engine and test in the **AEDLP Custom Policy Tester** before any production use.

---

## Purpose

Guide a user from a natural-language intent → recommended detector → editable regex → boundary/keyword tuning → client-side test → **copy/paste-ready AEDLP Architect implementation guidance**.

- **Primary workflow:** copy/paste generated values into a Custom Policy in AEDLP Architect.
- **Secondary workflow:** preview an **API parameter payload** for an *existing parameterized policy*.

> ⚠️ **The API payload does NOT create a new AEDLP Custom Policy.** It updates a parameter value used by an existing Custom Policy condition, where a valid `parameter_id` already exists. The visible Tessian/Proofpoint developer API (`PUT /filters/parameters/v1/{parameter_id}`) updates parameter values, not full policy creation.

---

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev      # start Vite dev server (http://localhost:5173)
npm run build    # type-check + production build
npm run preview  # preview the production build
```

---

## What is implemented

- Local search over detector aliases, display name, category, and country, with best-match recommendation.
- Detector recommendation card with metadata (category, region, confidence, false-positive risk, recommended action, attachment-scanning support, status/version).
- Editable regex editor with live JS-`RegExp` validation and case-insensitive toggle.
- **Boundary & substring controls:** as-is / `\b…\b` word boundaries / `(^|\s|:)…($|\s)` AEDLP-style / no wrapper — with a live **effective regex** preview.
- Context-keyword editor (add/remove).
- Client-side **test panel**: paste sample text, run, highlighted matches, match count, pass/fail and over-match warnings, load positive/negative examples.
- **Output panel** with three tabs:
  - **Architect** — copy/paste-ready fields (each with its own copy button) + "Copy full guide".
  - **API payload** — JSON payload, escaped/serialized payload, and a placeholder-only `curl` template.
  - **Checklist** — interactive testing checklist.
- Persistent **compatibility & support notes** and per-detector **engine-compatibility** metadata.
- Light/dark theme toggle (persisted to `localStorage`).

## What is mock data

- `src/data/patternLibrary.ts` — all 13 seed detectors, condition/action/boundary reference data, testing checklist, and compatibility notes. **Safe/example values only — no real personal data.** Regexes are marked `draft` until AEDLP compatibility is confirmed.

---

## Project structure

```
src/
  main.tsx                     app entry
  App.tsx                      shell, state, stepper, scroll-spy
  types.ts                     domain types
  styles.css                   design tokens (light/dark) + component styles
  data/patternLibrary.ts       static detectors + reference data (mock)
  lib/
    regex.ts                   boundary wrapping, client-side test, highlight, tokenize
    search.ts                  detector search / recommendation
  components/
    ui/Icon.tsx                inline icon set
    ui/index.tsx               Badge, Card, Callout, CopyButton, RegexHighlight, clipboard, tones
    PolicyIntentForm.tsx
    DetectorRecommendation.tsx (+ ComingSoon)
    RegexEditor.tsx
    BoundaryControls.tsx
    ContextKeywords.tsx
    RegexTestPanel.tsx
    CompatibilityNotes.tsx     (+ DetectorMeta)
    output/
      OutputPanel.tsx
      ArchitectCopyPasteOutput.tsx
      ApiParameterPayloadOutput.tsx
      TestingChecklist.tsx
      OutField.tsx
      guidance.ts              Architect guidance text + buildArchitectGuide()
```

---

## Future backend integration points

The frontend is modular so static data can be swapped for API calls later. Suggested endpoints (commented in `App.tsx` and the `lib/` and `data/` modules):

```
GET  /patterns/search?q=...
GET  /patterns/:id
POST /regex/test
POST /policy/recommend
POST /policy/render-instructions
POST /policy/export
GET  /parameters/:id
PUT  /parameters/:id
```

> **Never expose real API tokens in frontend code.** Any real Tessian/Proofpoint API integration must run through a **secure backend service**.

---

## AEDLP behavior captured in the UI

- **Enforcement actions:** Silently track · Warn · Warn & require justification · Block.
- **Outlook Add-in:** requires 2.4.4+; syncs every 30 min (restart Outlook to force); wait ≥60s after saving before testing.
- **Gateway:** requires Tessian Gateway; ~10 min to apply; "Warn & require justification" unsupported in bounceback warnings; hyperlinks render as plain-text URLs.
- **Attachment scanning:** DOC/XLS/PPT/DOCX/XLSX/PPTX, PDF/RTF/TXT/CSV, ZIP/G-ZIP/7-ZIP/G-ZIP-TAR. **Encrypted or password-protected attachments are not scanned.** Broad regex increases scan time.
- **Substring safety:** optional boundary wrappers reduce false positives but can change what text is included in a match.

---

## AEDLP compatibility items still needing confirmation

- Exact regex engine / flavor
- Lookahead / lookbehind support
- Unicode support and property classes
- Case-sensitivity behavior
- Pattern length / performance limits
- Full policy condition/exception schema
- Full policy import / creation API availability

Until confirmed, all detectors are `draft` and their `compatibility` flags are `unknown`.

---

## Known limitations

- Browser `RegExp` ≠ AEDLP production regex behavior.
- No Luhn checksum validation for credit-card patterns.
- Some seed patterns (e.g. NHS Number) are anchored (`^…$`) and only match standalone values — consider an unanchored variant for body scanning.
- No backend; all recommendations and tests run locally.
