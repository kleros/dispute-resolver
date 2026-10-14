/**
 * Every `data-testid` the parity extractor reads (ARCHITECTURE.md §12, 04 §1), as a runtime list so a test can compare it
 * with the tables of §12. `TestId` is derived from it: builders type their literals with it, so a misspelled hook fails
 * the typecheck.
 */
export const TEST_IDS = [
  // Case page (§12.1)
  "case-page",
  "case-compat-banner",
  "case-title",
  "case-question",
  "case-description",
  "case-ruling-options",
  "timeline-column",
  "case-votes",
  "case-court",
  "case-decision",
  "case-decision-ruling",
  "case-reality-notice",
  "appeal-panel",
  "appeal-card",
  "appeal-card-title",
  "evidence-item",
  "evidence-title",
  "evidence-description",
  "evidence-attachment",
  "evidence-hidden-count",
  "link-court",
  "link-arbitrable-app",
  "link-meta-evidence-file",
  "evidence-display",
  // Ongoing page (§12.2)
  "ongoing-page",
  "ongoing-card",
  "ongoing-card-title",
  "ongoing-card-court",
  "ongoing-card-countdown",
  // Create page (§12.2)
  "create-page",
  "create-court",
  "create-cost",
  "create-question-type",
  "create-option-count",
] as const;

export type TestId = (typeof TEST_IDS)[number];

/**
 * Every `data-*` attribute other than `data-testid` that §12 names. Values are written by React, so they are escaped; the
 * extractor reads them as attributes.
 */
export const DATA_ATTRIBUTES = [
  "data-state",
  "data-arbitrable",
  "data-family",
  "data-compatibility",
  "data-period",
  "data-last-period-change",
  "data-reality-notice",
  "data-ruling-options",
  "data-name",
  "data-value",
  "data-kind",
  "data-won-by",
  "data-code",
  "data-funded-percent",
  "data-remaining-wei",
  "data-deadline",
  "data-withdrawable-wei",
  "data-submitter",
  "data-timestamp",
  "data-count",
  "data-chain",
  "data-dispute-id",
  "data-options",
  "data-wei",
  "data-min",
  "data-max",
  "data-field",
  "data-required",
  "data-available",
] as const;

export type DataAttributeName = (typeof DATA_ATTRIBUTES)[number];
