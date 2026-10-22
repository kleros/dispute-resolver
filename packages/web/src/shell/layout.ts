export const GUTTER = "px-4 lg:px-[clamp(16px,8vw,132px)]";

export const CONTENT = "mx-auto w-full max-w-[1400px]";

/** In dark mode the white-background token is dark, so the bars use the primary text token there. */
export const BAR_TEXT = "text-klerosUIComponentsWhiteBackground dark:text-klerosUIComponentsPrimaryText";

/** The ring colour on the bars: the global focus rule (index.css) reads --dr-focus, which the bars point at --dr-focus-bar. */
export const BAR_FOCUS_TOKEN = "[--dr-focus:var(--dr-focus-bar)]";

export const BAR_SURFACE = `bg-klerosUIComponentsPrimaryPurple dark:bg-klerosUIComponentsLightBlue ${BAR_TEXT} ${BAR_FOCUS_TOKEN}`;

/** The shape of a focusable element on the bars; the ring itself is drawn by the global focus rule (index.css). */
export const BAR_FOCUS = "rounded-base";
