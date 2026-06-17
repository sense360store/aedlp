# AEDLP Policy Creator

A static, client side tool that helps you assemble an Adaptive Email DLP (AEDLP) custom policy from a
library of detectors, tune it, test it against sample text in the browser, and copy the values into the
AEDLP Architect Custom Policy editor by hand. A second page extracts a trusted domain whitelist from an
enforcer export. There is no backend and no API. Everything runs in the browser.

## Prototype only, please read

This is a planning and drafting aid, not the enforcement engine.

- The in browser tester uses the browser `RegExp` engine, which is not the AEDLP production engine.
  A pattern that matches here can behave differently in AEDLP. Always confirm in the AEDLP Custom
  Policy Tester before you rely on a policy.
- Payment card matching does not perform Luhn checksum validation, so it will over match.
- The detector patterns are drafts. Review and tune them for your environment.
- The seed library is example data only. It contains no real personal data, no real customer or
  competitor domains, and no real credentials. The competitor list uses the reserved `.example` TLD
  and must be replaced with your own list before use.

## The two pages

### Policy Creator (`/`)

Browse the detector library (regular expressions, keyword sets, keyword patterns, recipient domains,
and file types), add detectors to a policy draft, and combine them with ALL or ANY logic. The draft
suggests a name, description, tags, and action automatically and lets you override any field. The test
panel runs each condition against sample text and shows whether the policy would trigger. Copy each
field, or the whole policy, and paste it into the AEDLP Architect Custom Policy editor.

### Trusted Domain Extractor (`/trusted-domain-extractor`)

Drop an enforcer export (`.xlsx`, `.xls`, or `.csv`) and the page parses it entirely in the browser.
It reduces the external contacts to a clean, de duplicated list of email domains, lets you curate the
ones you trust, and exports the result as text, JSON, or CSV.

### Handoff between the pages

The extractor writes the curated whitelist to `localStorage` under the key `aedlp_trusted_domains`,
so the Policy Creator can pick it up in the same browser. The theme choice is stored under
`aedlp-theme`. These two keys are the only persistence the app uses.

## No backend

There is no server, database, API, runtime network request, secret, token, environment variable,
analytics, or third party telemetry. All data is static and lives in the bundle. The only state that
outlives a reload is the two `localStorage` keys above. Fonts are loaded from Google Fonts.

## Develop

Node 18 or newer.

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # type check then production build (the deploy gate)
npm run lint     # eslint
npm run test     # vitest
npm run preview  # serve the production build locally
```

## Stack

Vite, React 18, TypeScript (strict), `react-router-dom`, SheetJS (`xlsx`) for parsing enforcer
exports, and plain CSS. The build is a static site, deployed on Vercel. The extractor route is code
split so SheetJS is not loaded until that page is visited.

## Project layout

```
src/
  main.tsx                 app entry and routing
  styles.css               design tokens and styles (light and dark)
  theme.ts                 theme hook (persists to aedlp-theme)
  types.ts                 domain types
  data/
    library.ts             the detector library (AEDLP_DATA)
    recipients.ts          recipient domain lists
  lib/
    regex.ts match.ts      matching engine
    search.ts suggest.ts   search, filter, and the suggestion engine
    tones.ts               tone and label helpers
    extract.ts             enforcer export parsing (CSV stream and SheetJS)
  components/
    ui/                     shared primitives (Icon, Badge, Card, Callout, CopyButton, RegexHighlight)
    library/               the detector library panel
    policy/                the policy draft and test panel
  pages/
    PolicyCreator.tsx      the Policy Creator page
    Extractor.tsx          the Trusted Domain Extractor page
handoff/                   the original Claude Design prototype, kept for reference
```
