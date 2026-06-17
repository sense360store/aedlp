# AEDLP Policy Creator

A static, client side tool that helps you assemble an Adaptive Email DLP (AEDLP) custom policy from a
library of detectors, tune it, test it against sample text in the browser, and copy the values into the
AEDLP Architect Custom Policy editor by hand. A second page extracts a trusted domain whitelist from an
enforcer export. Everything runs in the browser, with one scoped exception: an opt-in "Find
competitors" lookup that calls a single serverless function (see "No backend, with one scoped
exception" below).

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

### Find competitors (Policy Creator)

A "Find competitors" panel on the Policy Creator looks up a company's competitors and their primary
corporate email domains. You type a company or customer name (and an optional industry); the app asks
Claude, through a serverless function, for the competitors from its own knowledge, verifies the
returned domains by DNS, and shows them as suggestions with a confidence chip and a verified /
unverified flag. You review the list, check the domains you want, and click Add to curate them into a
recipient-domain condition. Nothing is auto applied, and unverified or unchecked rows are never added
silently. (A name of two characters or fewer is too ambiguous to look up — the panel asks for a fuller
name first.)

Only the company name and industry you type are sent to the lookup service. Uploaded files and the
extractor stay in your browser and are never sent. This panel is the single exception to "no backend"
below.

### Handoff between the pages

The extractor writes the curated whitelist to `localStorage` under the key `aedlp_trusted_domains`,
so the Policy Creator can pick it up in the same browser. The theme choice is stored under
`aedlp-theme`. These two keys are the only persistence the app uses.

## No backend, with one scoped exception

The app is static and client side. The only state that outlives a reload is the two `localStorage`
keys above, and fonts are loaded from Google Fonts. There is no database, analytics, or third party
telemetry, and the extractor parses uploads entirely in the browser — it makes no network calls.

The **one** deliberate exception is the Find-competitors panel, which calls a single Vercel serverless
function, `api/competitors.ts`. That endpoint:

- accepts only `{ company, industry? }` — the company name you type is the only data that leaves the
  browser; uploaded files and the extractor are never sent;
- is gated by a shared-secret header (`x-aedlp-key`) and rate limited per client IP (10/min, 100/day)
  with a connected Upstash / Vercel KV store;
- calls Claude (`claude-sonnet-4-6`) for the competitors from its own knowledge (no web search, so it
  returns in a few seconds), verifies the returned domains by DNS, and returns suggestions for review.

Everything else in the app remains static and client side.

### Environment variables (the lookup only)

Set these in Vercel (Project Settings → Environment Variables). They are read at runtime / build time
and are never hardcoded:

| Variable | Scope | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | server | Claude API key for the lookup |
| `COMPETITORS_SHARED_SECRET` | server | must equal the `x-aedlp-key` header |
| `VITE_COMPETITORS_SHARED_SECRET` | client (build) | same value, sent as `x-aedlp-key` from the browser |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | server | rate-limit store (Vercel KV names) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | server | rate-limit store (native Upstash names; used if present) |

Connect an Upstash (or Vercel KV) store to the project; the function reads whichever variable pair is
injected. Without the store the function fails closed (HTTP 503) rather than skipping the rate limit.
Without `VITE_COMPETITORS_SHARED_SECRET` the panel still renders but lookups return an authorization
error.

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
split so SheetJS is not loaded until that page is visited. The competitor lookup adds one serverless
function under `api/`, using `@anthropic-ai/sdk` (Claude) and `@upstash/redis` (rate limiting) — both
server side only, never bundled into the browser.

## Project layout

```
api/
  competitors.ts           the one serverless function (competitor lookup); api/*.test.ts beside it
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
    trusted.ts             trusted-domain handoff (localStorage)
    competitors.ts         competitor-lookup client + recipient-domain handoff
    extract.ts             enforcer export parsing (CSV stream and SheetJS)
  components/
    ui/                     shared primitives (Icon, Badge, Card, Callout, CopyButton, RegexHighlight)
    library/               the detector library panel
    policy/                the policy draft and test panel
    competitors/           the Find-competitors modal
  pages/
    PolicyCreator.tsx      the Policy Creator page
    Extractor.tsx          the Trusted Domain Extractor page
handoff/                   the original Claude Design prototype, kept for reference
```
