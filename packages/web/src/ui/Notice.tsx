import { AlertMessage } from "@kleros/ui-components-library";
import type { NoticeProps, NoticeVariant } from "./types";

const DEFAULT_TITLES: Readonly<Record<NoticeVariant, string>> = {
  success: "Success",
  warning: "Warning",
  error: "Error",
  info: "Info",
};

/** A narrower inset below sm so the text column keeps its width on a phone; AlertMessage merges it through tailwind-merge. */
const ALERT_CLASS = "gap-3 px-4 sm:gap-4 sm:px-6";
/**
 * The library renders the title as an h2, the body as a small and the success mark as an svg carrying the success fill, so
 * the reveal reaches them as descendants. The check's rise is scaled to the 24 px icon.
 */
const REVEAL_CLASS = [
  "[&_h2]:animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards] motion-reduce:[&_h2]:animate-none",
  "[&_small]:animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_var(--stagger-stagger)_backwards] motion-reduce:[&_small]:animate-none",
  "[--check-y-amount:20px] [&_svg.fill-klerosUIComponentsSuccess]:animate-t-success-check motion-reduce:[&_svg.fill-klerosUIComponentsSuccess]:animate-none",
].join(" ");

export function Notice({ variant, title, body, className, reveal = false }: NoticeProps) {
  const alertClass = [ALERT_CLASS, reveal ? REVEAL_CLASS : undefined, className].filter(Boolean).join(" ");
  return (
    <div className="w-full whitespace-pre-line [overflow-wrap:anywhere]" role={variant === "error" ? "alert" : undefined}>
      <AlertMessage variant={variant} title={/\S/.test(title) ? title : DEFAULT_TITLES[variant]} msg={body} className={alertClass} />
    </div>
  );
}
