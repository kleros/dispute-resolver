/** The page gutter of ARCHITECTURE.md §11.1: 16 px below `lg`, `clamp(16px, 8vw, 132px)` from `lg`. */
export const GUTTER = "px-4 lg:px-[clamp(16px,8vw,132px)]";

/** The frame's content column: 1400 px at most, centered (§11.1). */
export const CONTENT = "mx-auto w-full max-w-[1400px]";

/** Text on the header and footer: white in light mode, the primary text token in dark mode (where white-background is dark). */
export const BAR_TEXT = "text-klerosUIComponentsWhiteBackground dark:text-klerosUIComponentsPrimaryText";

/** The ring colour on the bars: the global focus rule (index.css) reads --dr-focus, which the bars point at --dr-focus-bar. */
export const BAR_FOCUS_TOKEN = "[--dr-focus:var(--dr-focus-bar)]";

/** The footer surface (v2): primary purple in light mode, the dark `lightBlue` in dark mode, with the bar focus ring. */
export const BAR_SURFACE = `bg-klerosUIComponentsPrimaryPurple dark:bg-klerosUIComponentsLightBlue ${BAR_TEXT} ${BAR_FOCUS_TOKEN}`;

/** The shape of a focusable element on the bars; the ring itself is drawn by the global focus rule (index.css). */
export const BAR_FOCUS = "rounded-base";
