const BAR_MOTION = "origin-center [transform-box:fill-box] transition-transform duration-(--acc-chevron) ease-(--acc-ease) motion-reduce:transition-none";

/** The plus of a collapsed section, whose vertical bar folds away into a minus once the section is open. */
export function ExpandIndicator({ expanded }: { readonly expanded: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 fill-none stroke-klerosUIComponentsPrimaryText" strokeWidth="1.75" strokeLinecap="round">
      <path d="M2 8h12" />
      <path d="M8 2v12" vectorEffect="non-scaling-stroke" className={`${BAR_MOTION} ${expanded ? "scale-y-0" : "scale-y-100"}`} />
    </svg>
  );
}
