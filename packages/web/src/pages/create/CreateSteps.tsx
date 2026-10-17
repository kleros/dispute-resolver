interface CreateStepsProps {
  readonly titles: readonly string[];
  /** Zero-based index of the current step; the ones before it are completed. */
  readonly current: number;
}

interface StepState {
  readonly active: boolean;
  readonly completed: boolean;
}

/** A circled check for a completed step, a numbered circle otherwise. */
function StepBullet({ number, active, completed }: StepState & { readonly number: number }) {
  if (completed) {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-6 shrink-0 fill-none stroke-klerosUIComponentsPrimaryBlue" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="7.3" />
        <path d="m5 7.9 2.2 2.4 4-5" />
      </svg>
    );
  }
  const colors = active
    ? "border-klerosUIComponentsPrimaryBlue bg-klerosUIComponentsPrimaryBlue text-klerosUIComponentsWhiteBackground"
    : "border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground text-klerosUIComponentsSecondaryText";
  return (
    <span aria-hidden="true" className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${colors}`}>
      {number}
    </span>
  );
}

/**
 * The Create page's horizontal progress steps, laid out like the UI library's horizontal `Steps`: a bullet per step
 * joined by a line, the title beside the bullet from `lg` and centered under it below. The library's component passes
 * its boolean `active` prop through to a `div`, which React reports as an invalid DOM attribute (ui-components-library
 * 3.9.0), so the page renders its own.
 */
export function CreateSteps({ titles, current }: CreateStepsProps) {
  return (
    <ol className="flex w-full items-start justify-center">
      {titles.map((title, index) => {
        const active = index === current;
        const completed = index < current;
        const lineColor = completed ? "after:border-t-klerosUIComponentsPrimaryBlue" : "after:border-t-klerosUIComponentsStroke";
        const connector = index === titles.length - 1 ? "grow-0" : `grow after:mx-4 after:my-3 after:h-0 after:grow after:border-t ${lineColor}`;
        return (
          <li
            key={title}
            aria-label={title}
            aria-current={active ? "step" : undefined}
            aria-disabled={active || completed ? undefined : true}
            className={`relative flex items-start justify-center pb-6 lg:pb-0 ${connector}`}
          >
            <StepBullet number={index + 1} active={active} completed={completed} />
            <h2
              className={`absolute top-6 left-0 translate-x-[calc(-50%+12px)] text-center text-sm font-semibold whitespace-nowrap md:leading-6 lg:static lg:ml-2 lg:translate-x-0 ${active ? "text-klerosUIComponentsPrimaryText" : "text-klerosUIComponentsSecondaryText"}`}
            >
              {title}
            </h2>
          </li>
        );
      })}
    </ol>
  );
}
