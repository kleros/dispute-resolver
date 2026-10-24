/** The one decisive fact of a surface. */
export const FACT_LEAD = "text-xl font-semibold tracking-[-0.01em] text-klerosUIComponentsPrimaryText tabular-nums sm:text-2xl";

/** A primary fact. */
export const FACT = "text-xl font-semibold text-klerosUIComponentsPrimaryText tabular-nums";

/** A header-level fact. */
export const FACT_SMALL = "text-base font-semibold text-klerosUIComponentsPrimaryText";

/** The label before or above a fact, timestamps and helper text. */
export const LABEL = "text-sm text-klerosUIComponentsSecondaryText";

/** An eyebrow above a heading, styled like a label so the heading under it leads. */
export const EYEBROW = LABEL;

/** The display step of the product's own page titles. */
export const PAGE_TITLE = "text-2xl font-semibold tracking-[-0.01em] text-klerosUIComponentsPrimaryText lg:text-3xl";

/** The stamp shape shared by every chip: a rounded-full white object with a 1 px Stroke ring. */
const CHIP = "inline-flex h-7 max-w-full items-center rounded-full border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-3 text-sm";

/** A status chip. */
export const CHIP_STATUS = `${CHIP} font-semibold text-klerosUIComponentsPrimaryBlue`;

/** The plate under a decisive fact. */
export const PLATE = "bg-klerosUIComponentsMediumBlue";

/** The record band under a page's record header. No link or blue text sits on it. */
export const RECORD_BAND = "rounded-[18px] border border-(--dr-record-edge) bg-(--dr-record-surface)";
