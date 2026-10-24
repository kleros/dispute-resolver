import { resolveDisplayUrl } from "./display";
import { IMAGE_EXTENSIONS, TEXT_EXTENSIONS, VIDEO_EXTENSIONS } from "./extensions";
import { withoutQueryOrFragment } from "./syntax";
import type { AttachmentKind, AttachmentLink, GatewayOrigin } from "./types";

/**
 * Links follow the same rule as displays; any other non-empty value (other `http:` values, `javascript:`, `/ipns/`, a
 * path that is not content-addressed) is shown as `text`.
 */
export function toAttachmentLink(uri: unknown, gateway: GatewayOrigin): AttachmentLink | null {
  if (typeof uri !== "string") return null;
  const value = uri.trim();
  if (value === "") return null;
  const href = resolveDisplayUrl(value, gateway);
  if (href === null) return { kind: "text", text: value };
  return { kind: "link", href, label: lastPathSegment(value), attachmentKind: attachmentKind(value) };
}

export function lastPathSegment(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

/** The order matters: some extensions (`mng`, `svg`) are in more than one table. */
export function attachmentKind(pathOrUrl: string): AttachmentKind {
  const extension = extensionOf(pathOrUrl);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  return "other";
}

/** `path.extname` semantics: a name that starts with its only dot (`.png`) has no extension. */
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
