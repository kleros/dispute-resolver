/** The one decisive fact of a surface: the ruling in the decision panel, a funding card's Remaining or Required amount. */
export const FACT_LEAD = "text-xl font-semibold tracking-[-0.01em] text-klerosUIComponentsPrimaryText tabular-nums sm:text-2xl";

/** A primary fact: the timeline's current countdown, "Time left to fund", the Arbitration Cost on both Create pages. */
export const FACT = "text-xl font-semibold text-klerosUIComponentsPrimaryText tabular-nums";

/** A header-level fact: the dispute header's network, court and votes, the Ongoing card countdown, Court and Number of Votes on the Create summary. */
export const FACT_SMALL = "text-base font-semibold text-klerosUIComponentsPrimaryText";

/** The label before or above a fact: every dt, "Remaining", "of", "Time left to fund", "Ends in", "Submitted by", timestamps, helper text. */
export const LABEL = "text-sm text-klerosUIComponentsSecondaryText";

/** The eyebrows ("Interact with the dispute", "Fill up the form to", "Summary", "Search Disputes on", the question-type label), styled like a label so the heading under them leads. */
export const EYEBROW = LABEL;

/** The display step of the product's own page titles: "Ongoing Disputes", "Dispute #N", "Create a custom dispute". */
export const PAGE_TITLE = "text-2xl font-semibold tracking-[-0.01em] text-klerosUIComponentsPrimaryText lg:text-3xl";

/** The stamp shape shared by every chip: a rounded-full white object with a 1 px Stroke ring. */
export const CHIP = "inline-flex h-7 max-w-full items-center rounded-full border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-3 text-sm";

/** A status chip: "Latest jury decision" on the winning funding card. */
export const CHIP_STATUS = `${CHIP} font-semibold text-klerosUIComponentsPrimaryBlue`;

/** The plate under a decisive fact: the Create arbitration-cost plate, the decision panel, the winning funding card. */
export const PLATE = "bg-klerosUIComponentsMediumBlue";

/** The record band: the dispute header and the Create summary cover. No link or blue text sits on it. */
export const RECORD_BAND = "rounded-[18px] border border-(--dr-record-edge) bg-(--dr-record-surface)";
