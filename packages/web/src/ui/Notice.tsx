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
 * Every alert in the app, over the library `AlertMessage` (11.4). The variant set is closed, so an error can always be
 * shown (D-14). The body is plain text with its line breaks kept (spec 5.10); an error is announced as an alert.
 */
export function Notice({ variant, title, body, className, testId }: NoticeProps) {
  return (
    <div className="w-full whitespace-pre-line [overflow-wrap:anywhere]" role={variant === "error" ? "alert" : undefined} data-testid={testId}>
      <AlertMessage variant={variant} title={/\S/.test(title) ? title : DEFAULT_TITLES[variant]} msg={body} className={[ALERT_CLASS, className].filter(Boolean).join(" ")} />
    </div>
  );
}
