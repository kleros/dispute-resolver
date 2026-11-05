import { AttachmentIcon } from "./AttachmentIcon";
import { ExternalLink } from "./ExternalLink";
import type { AttachmentProps } from "./types";

const LINK_CLASS = "inline-flex max-w-full items-center gap-2 rounded-base text-klerosUIComponentsPrimaryBlue hover:underline";

/** Never rendered inline, whatever its kind. */
export function Attachment({ attachment }: AttachmentProps) {
  if (attachment === null) return null;
  if (attachment.kind === "text") {
    return <span className="text-klerosUIComponentsSecondaryText [overflow-wrap:anywhere]">{attachment.text}</span>;
  }
  return (
    <ExternalLink href={attachment.href} className={LINK_CLASS}>
      <AttachmentIcon kind={attachment.attachmentKind} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{attachment.label === "" ? "Attachment" : attachment.label}</span>
    </ExternalLink>
  );
}
