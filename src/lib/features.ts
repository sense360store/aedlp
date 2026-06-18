/* ============================================================
   Feature flags for surfaces that are intentionally hidden from the
   UI but kept in the codebase — the component, any backend and the
   tests all stay put. Each flag is read once here, so switching a
   surface back on is a single edit: flip the constant to `true`.
   ============================================================ */

/** "Find competitors" AI lookup entry point in the Policy Creator library. */
export const FEATURE_COMPETITOR_FINDER: boolean = false;

/** "Paste a sample to test" panel (and its per-row "Test this" entry point). */
export const FEATURE_TEST_PANEL: boolean = false;
