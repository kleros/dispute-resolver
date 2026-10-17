import type { TimelineColumn } from "@dispute-resolver/core";

const BULLET_CLASS: Readonly<Record<TimelineColumn["state"], string>> = {
  concluded: "bg-klerosUIComponentsPrimaryBlue",
  current: "border-2 border-klerosUIComponentsPrimaryBlue bg-klerosUIComponentsWhiteBackground",
  upcoming: "border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground",
};

/**
 * The timeline's 24 px bullet: a filled check for a concluded period, a ring with a dot for the current one, an empty ring
 * for an upcoming one. The decision panel reuses it to say where the timeline landed (contract §7). Decorative: callers
 * hide it from assistive technology, the label beside it carries the state.
 */
export function TimelineBullet({ state }: { readonly state: TimelineColumn["state"] }) {
  return (
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${BULLET_CLASS[state]}`}>
      {state === "concluded" ? (
        <svg viewBox="0 0 16 16" className="size-3.5 fill-none stroke-klerosUIComponentsWhiteBackground" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      ) : null}
      {state === "current" ? <span className="size-2.5 rounded-full bg-klerosUIComponentsPrimaryBlue" /> : null}
    </span>
  );
}
