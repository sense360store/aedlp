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
