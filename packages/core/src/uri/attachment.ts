import { resolveDisplayUrl } from "./display";
import { IMAGE_EXTENSIONS, TEXT_EXTENSIONS, VIDEO_EXTENSIONS } from "./extensions";
import { withoutQueryOrFragment } from "./syntax";
import type { AttachmentKind, AttachmentLink, GatewayOrigin } from "./types";

/**
 * An untrusted attachment reference made safe to show (A10, B19, D-26, D-32). A content-addressed path, or an https URL,
 * becomes a `link` through the same rule as displays; any other non-empty value (`http:`, `javascript:`, `/ipns/`, a
 * path that is not content-addressed) is shown as `text`. Empty or non-string values give `null`.
 */
export function toAttachmentLink(uri: unknown, gateway: GatewayOrigin): AttachmentLink | null {
  if (typeof uri !== "string") return null;
  const value = uri.trim();
  if (value === "") return null;
  const href = resolveDisplayUrl(value, gateway);
  if (href === null) return { kind: "text", text: value };
  return { kind: "link", href, label: lastPathSegment(value), attachmentKind: attachmentKind(value) };
}

/** The text after the last `/`, today's attachment label (spec 5.6). */
export function lastPathSegment(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

/** The icon class of an attachment from its extension (A17): image, then video, then text, else other, as today. */
export function attachmentKind(pathOrUrl: string): AttachmentKind {
  const extension = extensionOf(pathOrUrl);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  return "other";
}

/**
 * The lowercase extension of the last path segment, ignoring the query, the fragment and trailing slashes, with
 * `path.extname` semantics: a name that starts with its only dot (`.png`) has none.
 */
function extensionOf(pathOrUrl: string): string {
  const name = lastPathSegment(withoutTrailingSlashes(withoutQueryOrFragment(pathOrUrl)));
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path.charAt(end - 1) === "/") end -= 1;
  return path.slice(0, end);
}
