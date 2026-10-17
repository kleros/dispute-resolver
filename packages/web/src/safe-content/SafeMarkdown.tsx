import { isSafeNavigationUrl } from "@dispute-resolver/core";
import type { ComponentProps, JSX } from "react";
import Markdown from "react-markdown";
import type { Components, ExtraProps } from "react-markdown";
import { remarkLegacyGfm } from "./legacyGfm";
import { markdownUrlTransform } from "./markdownUrl";
import type { SafeMarkdownProps } from "./types";

type ElementProps<Tag extends keyof JSX.IntrinsicElements> = ComponentProps<Tag> & ExtraProps;

const LINK_CLASS =
  "rounded-base text-klerosUIComponentsPrimaryBlue underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-klerosUIComponentsPrimaryBlue";

/**
 * A description link (A11, D-31): the transformed URL in a new tab with `rel="noopener noreferrer"`. A refused URL
 * arrives empty and its label is kept as text. `http:` stays a link here: D-32 covers attachments and interfaces only.
 */
function MarkdownLink({ href, title, children }: ElementProps<"a">) {
  if (href === undefined || href === "") return <span>{children}</span>;
  return (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

/** A description image (D-31): loaded only from an absolute https URL, without a referrer; otherwise its alt text. */
function MarkdownImage({ src, alt, title }: ElementProps<"img">) {
  if (!isSafeNavigationUrl(src)) return alt ? <span>{alt}</span> : null;
  return <img src={src} alt={alt ?? ""} title={title} referrerPolicy="no-referrer" loading="lazy" className="inline-block h-auto max-w-full align-middle" />;
}

/** A task item's box (spec §5.6): shows its state and cannot be changed. */
function TaskCheckbox({ type, checked }: ElementProps<"input">) {
  if (type !== "checkbox") return null;
  return <input type="checkbox" checked={checked === true} disabled readOnly aria-label="Task" className="mr-2 size-4 align-middle accent-klerosUIComponentsPrimaryBlue" />;
}

function MarkdownTable({ children }: ElementProps<"table">) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

const CELL_CLASS = "border border-klerosUIComponentsStroke px-3 py-2 text-left align-top";

function MarkdownPre({ children }: ElementProps<"pre">) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsLightGrey p-3 font-mono text-sm [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  );
}

/** One component per element so `node` and other renderer props never reach the DOM. */
const COMPONENTS: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  pre: MarkdownPre,
  h1: ({ children }) => <h3 className="text-xl font-semibold">{children}</h3>,
  h2: ({ children }) => <h4 className="text-lg font-semibold">{children}</h4>,
  h3: ({ children }) => <h5 className="text-base font-semibold">{children}</h5>,
  h4: ({ children }) => <h6 className="text-base font-semibold">{children}</h6>,
  h5: ({ children }) => <h6 className="text-sm font-semibold">{children}</h6>,
  h6: ({ children }) => <h6 className="text-sm font-semibold text-klerosUIComponentsSecondaryText">{children}</h6>,
  p: ({ children }) => <p className="leading-6">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="list-decimal space-y-1 pl-6">
      {children}
    </ol>
  ),
  li: ({ children, className }) => <li className={className === "task-list-item" ? "list-none" : "pl-1"}>{children}</li>,
  input: TaskCheckbox,
  table: MarkdownTable,
  th: ({ children, style }) => (
    <th style={style} className={`${CELL_CLASS} bg-klerosUIComponentsLightGrey font-semibold`}>
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className={CELL_CLASS}>
      {children}
    </td>
  ),
  blockquote: ({ children }) => <blockquote className="border-l-4 border-klerosUIComponentsStroke pl-4 text-klerosUIComponentsSecondaryText [&>*+*]:mt-3">{children}</blockquote>,
  code: ({ children }) => (
    <code className="rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsLightGrey px-1 font-mono text-[0.875em] [overflow-wrap:anywhere]">{children}</code>
  ),
  hr: () => <hr className="border-klerosUIComponentsStroke" />,
};

const REMARK_PLUGINS = [remarkLegacyGfm];

/**
 * Untrusted markdown (A11, B14, D-31), rendered through React with no rehype plugin: raw HTML in the source is shown
 * as text, link URLs follow today's allowlist, links open in a new tab and images load only from https. Today's
 * GitHub-flavored syntax (literal URLs, strikethrough, tables, task items) is restored by `remarkLegacyGfm` (§5.6),
 * on line endings normalized to `\n` as remark-parse 5 did.
 * Headings start at `h3` because a description sits under the page's `h1` and the summary's `h2`.
 */
export function SafeMarkdown({ source, className }: SafeMarkdownProps) {
  const rootClass = "min-w-0 break-words text-klerosUIComponentsPrimaryText [&>*+*]:mt-3";
  return (
    <div className={className === undefined ? rootClass : `${rootClass} ${className}`}>
      <Markdown urlTransform={markdownUrlTransform} components={COMPONENTS} remarkPlugins={REMARK_PLUGINS}>
        {source.replace(/\r\n?/g, "\n")}
      </Markdown>
    </div>
  );
}
