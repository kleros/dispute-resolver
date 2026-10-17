import type { AttachmentKind } from "@dispute-resolver/core";

/** Path data of each icon, on a 24 px grid stroked with the current color (today's icon table, spec 5.14). */
const ICON_PATHS: Readonly<Record<AttachmentKind, readonly string[]>> = {
  image: ["M4 5h16v14H4z", "M4 16l5-5 4 4 2-2 5 5", "M15.5 9.5h.01"],
  video: ["M4 6h11v12H4z", "M15 10l5-3v10l-5-3"],
  text: ["M6 3h8l4 4v14H6z", "M14 3v4h4", "M9 12h6", "M9 16h6"],
  other: ["M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"],
};

/** The decorative icon of an attachment, chosen from its extension (A17). */
export function AttachmentIcon({ kind }: { readonly kind: AttachmentKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {ICON_PATHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
