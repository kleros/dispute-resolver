import { hasVisibleText } from "./visibleText";
import type { VotingOption } from "./votingOptions";

/**
 * The title comes first on screen and the code after it, but the DOM keeps the one-line form "Option {code} - {title}:
 * {description}", or "{title}: {description}" for an option without a code, with the separators visually hidden, so
 * assistive technology and copying read it in that order.
 */
function VotingOptionEntry({ option }: { readonly option: VotingOption }) {
  const { code, description } = option;
  const describedOnScreen = description !== undefined && hasVisibleText(description);
  return (
    <li className="flex flex-col gap-1 text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {code === undefined ? null : (
          <span className="order-last text-sm leading-5 text-klerosUIComponentsSecondaryText tabular-nums">
            {code}
            <span className="sr-only">{" - "}</span>
          </span>
        )}
        <span className="text-base leading-6 font-semibold">{option.title}</span>
        {description === undefined || describedOnScreen ? null : (
          <span className="sr-only">
            {": "}
            {description}
          </span>
        )}
      </p>
      {describedOnScreen ? (
        <p className="whitespace-pre-line text-sm leading-6 text-pretty">
          <span className="sr-only">{": "}</span>
          {description}
        </p>
      ) : null}
    </li>
  );
}

/** The empty list-style-type replaces the preflight's `none`, for which WebKit drops the list semantics. */
export function VotingOptionList({ options, className }: { readonly options: readonly VotingOption[]; readonly className?: string }) {
  return (
    <ul className={["flex flex-col gap-4 [list-style-type:'']", className].filter(Boolean).join(" ")}>
      {options.map((option) => (
        <VotingOptionEntry key={option.key} option={option} />
      ))}
    </ul>
  );
}
