/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Shared secret for the competitor-lookup endpoint, sent as the x-aedlp-key
   * header. Same value as the server's COMPETITORS_SHARED_SECRET. Build-time
   * only — not a runtime secret (it gates a rate-limited, non-sensitive lookup).
   */
  readonly VITE_COMPETITORS_SHARED_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * App version / commit, injected at build time by Vite's `define` (see
 * vite.config.ts). Read via the typeof guard in lib/diagnostics.ts so a bare
 * unit-test run without the define still type-checks and runs.
 */
declare const __APP_VERSION__: string;
