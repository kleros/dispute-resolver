import { isSafeNavigationUrl } from "@dispute-resolver/core";
import type { ExternalLinkProps } from "./types";

const LINK_CLASS = "rounded-base text-klerosUIComponentsPrimaryBlue underline decoration-1 underline-offset-2 hover:decoration-2 [overflow-wrap:anywhere]";
const TEXT_CLASS = "[overflow-wrap:anywhere]";

/** The app's only external anchor: any value but an absolute https URL is shown as plain text, never linked. */
export function ExternalLink({ href, children, className }: ExternalLinkProps) {
  const label = children ?? href;
  if (!isSafeNavigationUrl(href)) {
    return <span className={className ?? TEXT_CLASS}>{label}</span>;
  }
  return (
    <a href={href.trim()} target="_blank" rel="noopener noreferrer" className={className ?? LINK_CLASS}>
      {label}
    </a>
  );
}
