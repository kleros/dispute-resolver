/** react-markdown 4's link allowlist. react-markdown 9's default would allow `irc`, `ircs`, `xmpp` and drop `tel`. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http", "https", "mailto", "tel"]);

/**
 * react-markdown 4's `uriTransformer`, except that a refused URL becomes `""` instead of `javascript:void(0)`, so
 * `SafeMarkdown` renders no anchor for it.
 */
export function markdownUrlTransform(url: string): string {
  const value = url.trim();
  const first = value.charAt(0);
  if (first === "#" || first === "/") return value;
  const colon = value.indexOf(":");
  if (colon === -1) return value;
  if (ALLOWED_PROTOCOLS.has(value.slice(0, colon).toLowerCase())) return value;
  const query = value.indexOf("?");
  if (query !== -1 && colon > query) return value;
  const fragment = value.indexOf("#");
  if (fragment !== -1 && colon > fragment) return value;
  return "";
}
