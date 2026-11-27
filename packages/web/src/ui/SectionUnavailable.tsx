import { Notice } from "./Notice";
import { RetryButton } from "./RetryButton";
import type { SectionUnavailableProps } from "./types";

export function SectionUnavailable({ section, error, onRetry }: SectionUnavailableProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <Notice variant="warning" title={`${section} unavailable`} body={error.message} className="w-full" />
      {onRetry === undefined ? null : <RetryButton label={`Retry ${section}`} onRetry={onRetry} small />}
    </div>
  );
}
