import type { SVGProps } from "react";

/**
 * The look of the header's two menu triggers, the network pill and the account pill: a tint of the bar's own text
 * colour, so it reads on the purple light bar and on the dark bar alike.
 */
export const BAR_PILL =
  "h-10 rounded-full bg-current/10 px-3 text-sm font-semibold transition-[background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-current/15 motion-reduce:transition-none";

/** The pill's open-menu chevron; decorative, since the trigger's `aria-expanded` carries the state. */
export function ChevronIcon({ className }: Readonly<Pick<SVGProps<SVGSVGElement>, "className">>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M5.3 8.3a1 1 0 0 1 1.4 0L12 13.58l5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}
