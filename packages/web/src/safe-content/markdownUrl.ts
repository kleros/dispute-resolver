/** Today's react-markdown 4 link allowlist (A11). react-markdown 9's default would allow `irc`, `ircs`, `xmpp` and drop `tel`. */
const ALLOWED_PROTOCOLS: readonly string[] = ["http", "https", "mailto", "tel"];

/**
 * The `urlTransform` of `SafeMarkdown`: a port of react-markdown 4's `uriTransformer` (A11). Relative URLs and the
 * allowed protocols are kept, trimmed; any other scheme becomes `""`, where today's renderer wrote `javascript:void(0)`.
 */
export function markdownUrlTransform(url: string): string {
  const value = url.trim();
  const first = value.charAt(0);
  if (first === "#" || first === "/") return value;
  const colon = value.indexOf(":");
  if (colon === -1) return value;
  if (ALLOWED_PROTOCOLS.includes(value.slice(0, colon).toLowerCase())) return value;
  const query = value.indexOf("?");
  if (query !== -1 && colon > query) return value;
  const fragment = value.indexOf("#");
  if (fragment !== -1 && colon > fragment) return value;
  return "";
}
