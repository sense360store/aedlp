/* ============================================================
   Feature flags for surfaces that are intentionally hidden from the
   UI but kept in the codebase — the component, any backend and the
   tests all stay put. Each flag is read once here, so switching a
   surface back on is a single edit: flip the constant to `true`.

   The GenAI competitor lookup is NOT gated: it is a first-class,
   visible feature, surfaced both from the Customer setup wizard and
   from the Policy Creator's Recipients view.
   ============================================================ */

/** "Paste a sample to test" panel (and its per-row "Test this" entry point). */
export const FEATURE_TEST_PANEL: boolean = false;
