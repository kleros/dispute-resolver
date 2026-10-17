// Public surface of `ui` (ARCHITECTURE.md §11.3): section states, the section error boundary of §5.7, and the shared
// primitives for alerts, countdowns, amounts, addresses and periods, and the fact-tier classes (facts.ts).
export type * from "./types";
export { ACTION_LINK_CLASS } from "./actionLink";
export { AddressText } from "./AddressText";
export { Amount } from "./Amount";
export { Countdown } from "./Countdown";
export { EmptyState } from "./EmptyState";
export { CHIP, CHIP_INFO, CHIP_STATUS, EYEBROW, FACT, FACT_LEAD, FACT_SMALL, LABEL, PAGE_TITLE, PLATE, RECORD_BAND } from "./facts";
export { Identicon } from "./Identicon";
export { Notice } from "./Notice";
export { PageMessage } from "./PageMessage";
export { PeriodBadge } from "./PeriodBadge";
export { SectionBoundary } from "./SectionBoundary";
export { SectionSkeleton } from "./SectionSkeleton";
export { SectionUnavailable } from "./SectionUnavailable";
export { shortenAddress } from "./address";
export { formatAmount } from "./amount";
export { formatDuration } from "./duration";
