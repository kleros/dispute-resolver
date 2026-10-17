import { isSafeNavigationUrl } from "@dispute-resolver/core";
import type { ExternalLinkProps } from "./types";

/** The inline-prose link (contract §5 a): underlined at rest, a thicker underline on hover; the focus ring is global. */
const LINK_CLASS = "rounded-base text-klerosUIComponentsPrimaryBlue underline decoration-1 underline-offset-2 hover:decoration-2 [overflow-wrap:anywhere]";
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
