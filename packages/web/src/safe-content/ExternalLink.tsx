import { isSafeNavigationUrl } from "@dispute-resolver/core";
import type { ExternalLinkProps } from "./types";

const LINK_CLASS =
  "rounded-base text-klerosUIComponentsPrimaryBlue underline-offset-2 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-klerosUIComponentsPrimaryBlue";
const TEXT_CLASS = "[overflow-wrap:anywhere]";

/**
 * The only external anchor of the app (A10, B19, D-32): an absolute https URL opens in a new tab with
 * `rel="noopener noreferrer"`; any other value is shown as plain text, never linked. A caller's `className` replaces the
 * default style.
 */
export function ExternalLink({ href, children, className, testId }: ExternalLinkProps) {
  const label = children ?? href;
  if (!isSafeNavigationUrl(href)) {
    return (
      <span className={className ?? TEXT_CLASS} data-testid={testId}>
        {label}
      </span>
    );
  }
  return (
    <a href={href.trim()} target="_blank" rel="noopener noreferrer" className={className ?? LINK_CLASS} data-testid={testId}>
      {label}
    </a>
  );
}
